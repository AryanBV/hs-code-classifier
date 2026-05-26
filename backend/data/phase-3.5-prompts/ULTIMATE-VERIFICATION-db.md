# DB State Verification — Ready for Phase 4?

**Project:** `waowoznsvaosgcgiivzo` (Supabase Postgres 17, ap-northeast-1)
**Verified:** 2026-05-25
**Verdict:** **YES — DB is Phase 4-ready** (with 1 cosmetic note labeling inconsistency, non-blocking)

---

## A. Row counts (expected vs actual)

| Table | Expected | Actual | OK |
|---|---|---|---|
| `sections` | 21 | 21 | YES |
| `sections` with `notes` populated | 9+ | **21** (all populated) | YES (exceeds spec) |
| `chapters` | 97 | 97 | YES |
| `headings` | 1,232 | 1,232 | YES |
| `subheadings` | 5,613 | 5,613 | YES |
| `tariff_lines` | 12,460 | 12,460 | YES |
| `chapter_exclusions` | 1,505 | **1,505** | YES (Phase 3.5 A1 +352 net confirmed) |
| `policy_conditions` | 0 | 0 | YES (deferred to Phase 8) |
| `subheadings.wco_2022_match=true` | (single 2709.00 fix) | 5,389 total flagged; **2709.00=true ✓** | YES (A6 fix confirmed) |

**Per-chapter `chapter_exclusions` distribution:** 97 chapters covered, range 1-43 rules per chapter (e.g., Ch.59=43, Ch.95=41, Ch.90=40, Ch.84=39, Ch.60=39, Ch.61=39 at high end; Ch.23=1, Ch.10=2, Ch.08=2 at low end). Distribution looks plausible — heavy textile/machinery chapters carry the most exclusions, as expected.

---

## B. Schema verification

### `chapter_exclusions` columns
| Column | Type | Nullable | OK |
|---|---|---|---|
| `id` | integer | NO | YES |
| `source_chapter` | text | NO | YES |
| `excluded_product_text` | text | NO | YES |
| `redirects_to_chapter` | **ARRAY** (text[]) | YES | **YES (A5 migration confirmed)** |
| `redirects_to_heading` | text | YES | YES |
| `source_note_number` | text | YES | YES |
| `source_note_text` | text | YES | YES |

### `tariff_lines` columns
| Column | Type | Nullable | OK |
|---|---|---|---|
| `code` | text | NO | YES |
| `subheading` | text | NO | YES |
| `description` | text | NO | YES |
| `unit` | text | YES | YES |
| `export_policy` | text | YES | YES |
| `policy_condition` | text | YES | YES |
| `embedding` | vector (USER-DEFINED) | YES | YES |
| `fts_search_text` | **text** | **NO** | **YES (A4 migration confirmed — NOT NULL enforced)** |

### CHECK constraints (code format integrity)
All present and enforced:
- `chapters_format_chk`: `chapter ~ '^\d{2}$'`
- `headings_format_chk`: `heading ~ '^\d{4}$'`
- `headings_prefix_chk`: `LEFT(heading,2) = chapter`
- `subheadings_format_chk`: `subheading ~ '^\d{4}\.\d{2}$'`
- `subheadings_prefix_chk`: `LEFT(subheading,4) = heading`
- `tariff_lines_format_chk`: `code ~ '^\d{4}\.\d{2}\.\d{2}$'`
- `tariff_lines_prefix_chk`: `LEFT(code,7) = subheading`

### `chapter_exclusions` constraints (PF8 + A5 + FK)
| Constraint | Type | Definition | OK |
|---|---|---|---|
| `chapter_exclusions_pkey` | PK | `(id)` | YES |
| `chapter_exclusions_source_fkey` | FK | `source_chapter → chapters(chapter)` ON UPDATE CASCADE ON DELETE CASCADE | YES |
| `chapter_exclusions_redirect_hd_fkey` | FK | `redirects_to_heading → headings(heading)` ON UPDATE CASCADE ON DELETE SET NULL | YES |
| `chapter_exclusions_idempotent_key` | UNIQUE | `UNIQUE NULLS NOT DISTINCT (source_chapter, excluded_product_text, source_note_number, redirects_to_chapter, redirects_to_heading)` | **YES (PF8 migration confirmed)** |

### Triggers
| Trigger | Table | Event | Definition | OK |
|---|---|---|---|---|
| `chapter_exclusions_validate_redirects` | chapter_exclusions | BEFORE INSERT OR UPDATE OF redirects_to_chapter | EXECUTE FUNCTION `validate_chapter_exclusions_redirects()` | YES |
| `tariff_lines_fts_text_maintain` | tariff_lines | BEFORE INSERT OR UPDATE OF description, subheading | EXECUTE FUNCTION `trg_tariff_lines_update_fts_text()` | YES |

### Supporting functions
- `validate_chapter_exclusions_redirects()` — iterates `unnest(redirects_to_chapter)`, raises EXCEPTION if any element not in `chapters.chapter`. Confirmed correct.
- `trg_tariff_lines_update_fts_text()` — `NEW.fts_search_text := compute_tariff_line_fts_text(NEW.subheading, NEW.description)`. Confirmed.
- `refresh_fts_search_text()` — bulk re-populate helper; returns row count.

---

## C. fts_search_text content

| Metric | Value | OK |
|---|---|---|
| Total rows | 12,460 | YES |
| Non-null `fts_search_text` | 12,460 (100%) | YES |
| min length | 22 chars | YES |
| max length | 2,979 chars | YES |
| avg length | 315 chars | YES |

**Sample FTS query** (`websearch_to_tsquery('crude petroleum')`):
1. `2709.00.10` — MINERAL FUELS, MINERAL OILS AND PRODUCTS OF THEIR DISTILLATION...
2. `2709.00.90` — MINERAL FUELS, MINERAL OILS AND PRODUCTS OF THEIR DISTILLATION...
3. `2712.10.10` — MINERAL FUELS, MINERAL OILS AND PRODUCTS OF THEIR DISTILLATION...

2709.00 codes rank top-1 and top-2 — FTS working correctly.

---

## D. Spike-fix rules present

### Case-8: Ch.42 Note 1 imitation leather → ['39','59']
**Found row id 2646:**
- `source_chapter='42'`, `source_note_number='Note 1'`
- text: "imitation, synthetic or artificial \"leather\" sheets, fabrics or articles made of plastic (e.g. PU, P..."
- `redirects_to_chapter=['39','59']` (text[] array, both targets present)
- VERIFIED YES

### Case-5: Ch.85 Note 2 → 8512
**Found row id 3012:**
- `source_chapter='85'`, `source_note_number='Note 2'`
- text: "Headings 8501 to 8504 do not apply to goods described in headings 8511, 8512, 8540, 8541 or 8542"
- `redirects_to_heading='8512'`, `redirects_to_chapter=['85']`
- VERIFIED YES
- (Also a related row id 2378 with source_note_number='2' and similar text exists — same semantic content, different note_number formatting.)

### Case-1: Section XVII Note 2(a) rubber → 4016 across Ch.86/87/88/89
**Present on all 4 chapters with the rubber→4016 rule, BUT label inconsistency:**
| Chapter | row id | source_note_number | Status |
|---|---|---|---|
| 86 | 2392 | `Section XVII Note 2(a)` | canonical |
| 88 | 2441 | `Section XVII Note 2(a)` | canonical |
| 87 | 2419 | **`Section Note 2(a)`** | NON-CANONICAL (missing "XVII") |
| 89 | 2461 | **`Section Note 2(a)`** | NON-CANONICAL (missing "XVII") |

Full distribution check: **Ch.86 and Ch.88 use "Section XVII Note 2(...)" prefix; Ch.87 and Ch.89 use bare "Section Note 2(...)" prefix.** Semantic content (redirects, text) is correct on all 4. This is a cosmetic labeling drift — see Issues below.

### Case-2: Ch.09 → Ch.21 reciprocal (A1b)
**Found 4 rules in Ch.09 with redirect to ['21']:**
- row 3024: `A1b-reciprocal-of-Ch21-Note-1(b)+1(c)+1(d)` → 2101 (extracts of coffee/tea/mate)
- row 1536: `Note 1` → 2103 (mixed condiments/seasonings)
- (+2 more — Ch.09 has 4 total redirects to Ch.21)

**Reciprocal direction Ch.21 → Ch.09 also present:**
- row 1632: `1(b)` "roasted coffee substitutes containing coffee in any proportion" → 0901
- row 1633: `1(c)` "flavoured tea" → 0902
- row 1634: `1(d)` "spices or other products of headings 0904 to 0910" → (no specific heading)

VERIFIED YES (bidirectional A1b reciprocal confirmed).

### A3: Jasmine 3301.22 re-extract
- Subheading `3301.22` exists in `subheadings`: `wco_2022_match=false`, `india_specific=true`, `india_specific_note` populated explaining the India-specific encoding ("Of jasmin" — column wrap with 33012400 in PDF).
- No 8-digit tariff_lines under 3301.22 (consistent with PDF — Indian schedule treats 3301.22 as a subheading without further splits).
- VERIFIED YES (A3 outcome captured correctly).

### A6: 2709.00 wco_2022_match fix
- `subheading='2709.00'`: `wco_2022_match=true`, `india_specific=false`, `india_specific_note=null`.
- VERIFIED YES.

---

## E. Embeddings (4 levels)

| Level | Rows | With embedding | OK |
|---|---|---|---|
| chapters | 97 | 97 (100%) | YES |
| headings | 1,232 | 1,232 (100%) | YES |
| subheadings | 5,613 | 5,613 (100%) | YES |
| tariff_lines | 12,460 | 12,460 (100%) | YES |

All 4 levels fully populated at Cohere embed-v4 1536-d.

---

## F. Indexes (HNSW + GIN)

| Table | Index | Definition | OK |
|---|---|---|---|
| chapters | `idx_chapters_embedding_hnsw` | HNSW (embedding vector_cosine_ops) m=16 ef_construction=64 | YES |
| headings | `idx_headings_embedding_hnsw` | HNSW (embedding vector_cosine_ops) m=16 ef_construction=64 | YES |
| subheadings | `idx_subheadings_embedding_hnsw` | HNSW (embedding vector_cosine_ops) m=16 ef_construction=64 | YES |
| tariff_lines | `idx_tariff_lines_embedding_hnsw` | HNSW (embedding vector_cosine_ops) m=16 ef_construction=64 | YES |
| tariff_lines | `tariff_lines_fts_search_text_gin` | GIN (to_tsvector('english', fts_search_text)) | **YES (A4 migration confirmed)** |
| tariff_lines | `idx_tl_description_fts` | GIN (to_tsvector('english', description)) | YES (auxiliary) |
| chapter_exclusions | `idx_excl_text_fts` | GIN (to_tsvector('english', excluded_product_text)) | YES |

All HNSW + the new fts_search_text GIN index present.

---

## G. RLS state

All 7 tables have `rowsecurity=true`:
- chapter_exclusions, chapters, headings, policy_conditions, sections, subheadings, tariff_lines

VERIFIED YES.

---

## H. Migration evidence (via `supabase_migrations.schema_migrations`)

`list_migrations` MCP was temporarily unavailable; queried directly. **11 migrations** found, with **5 recent migrations dated 2026-05-23** matching the Phase 3.5 window:
- `20260523193338`
- `20260523193235`
- `20260523193043`
- `20260523192817`
- `20260523091056`

Migration names not visible via this view (only versions are recorded in `supabase_migrations.schema_migrations` for SQL-applied migrations). However, the schema/triggers/constraints inspected above (A5 text[] type, A6 2709.00 wco_match=true, A4 fts_search_text NOT NULL + GIN + trigger, PF8 UNIQUE NULLS NOT DISTINCT) **empirically confirm all 4-5 Phase 3.5 migrations applied successfully**.

---

## I. Integrity sample query

`SELECT code FROM tariff_lines WHERE to_tsvector('english', fts_search_text) @@ websearch_to_tsquery('english', 'crude petroleum') ORDER BY ts_rank(...) DESC LIMIT 5`:

```
2709.00.10
2709.00.90
2712.10.10
2710.20.90
2710.20.10
```

Top 2 = crude petroleum (2709.00.10/90) — FTS ranking is correct.

---

## Overall verdict

**DB Phase 4-ready: YES**

All blocking criteria pass:
- Row counts match spec exactly (sections/chapters/headings/subheadings/tariff_lines/chapter_exclusions/policy_conditions)
- All 4 Phase 3.5 migrations applied (A6, A5, A4, PF8 — empirically verified via schema/triggers/constraints)
- All 4 spike-fix rule families present (Case-1/2/5/8 + A3 + A6)
- All 4 embedding levels populated (97/1232/5613/12460)
- All HNSW indexes + GIN FTS index present
- RLS enabled across all 7 tables
- CHECK constraints enforce all 7 code-format invariants
- Triggers (validate_redirects + fts_text_maintain) installed and correct

### Issues found

**1. Section XVII note_number labeling inconsistency (Ch.87, Ch.89)** — COSMETIC, NON-BLOCKING

Ch.86 and Ch.88 use `source_note_number='Section XVII Note 2(a)'` etc. for the Section XVII Notes. Ch.87 and Ch.89 use the bare `source_note_number='Section Note 2(a)'` (missing the "XVII"). All 12 sub-letters are affected symmetrically on each chapter, and the semantic content (excluded text, redirect chapters/headings) is correct on all 4. This affects any Phase 4 retrieval code that does exact match on `source_note_number` like `'Section XVII Note 2(a)'` — it will hit Ch.86/88 but miss Ch.87/89. Workarounds: (a) match on `ILIKE '%Section%Note 2(a)%'`, or (b) normalize the labels.

**2. Subheading 3301.22 has zero child tariff_lines** — EXPECTED, NOT A DEFECT

Per the `india_specific_note` on the row, this subheading is treated as a leaf in the Indian schedule (no 8-digit splits). Behavior consistent with the PDF source. A3 task outcome correctly captured.

### Recommended fixes (if you want to clean up before Phase 4)

**Optional — normalize the Ch.87/Ch.89 Section XVII labels** (1-line SQL, idempotent):

```sql
UPDATE chapter_exclusions
SET source_note_number = REPLACE(source_note_number, 'Section Note', 'Section XVII Note')
WHERE source_chapter IN ('87','89') AND source_note_number LIKE 'Section Note%';
```

This would touch ~26 rows (13 in Ch.87 + 13 in Ch.89) and bring them in line with Ch.86/Ch.88. The UNIQUE constraint will not be violated because no rule has identical (source_chapter, text, note_number, redirect_chapter, redirect_heading) tuples across this change. Apply via the trigger/migration system or as a one-off DML.

If Phase 4 retrieval uses fuzzy matching on `source_note_number`, this is purely cosmetic and can be deferred.

---

## Report payload

```json
{
  "db_phase4_ready": true,
  "row_counts_match": true,
  "all_triggers_present": true,
  "all_indexes_present": true,
  "spike_fixes_present": true,
  "blocking_issues": [],
  "non_blocking_issues": [
    "Ch.87/Ch.89 use 'Section Note X' label instead of canonical 'Section XVII Note X' (semantic content correct; 26 rows affected; cosmetic)"
  ],
  "output_path": "C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/ULTIMATE-VERIFICATION-db.md"
}
```

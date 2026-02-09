# Blocker Fix Report: 5 Classification Failures

**Date:** 2026-02-09
**Status:** All 5 blocker cases fixed

---

## A. Bugs Found and Fixed

### Bug 1: LENGTH(code) = 8 in SQL queries
- **Files:** `backend/src/database/hs-codes.ts:68`, `backend/src/classifier/code-selector.ts:54`
- **Impact:** ALL classifications hit `.00.00` fallback (0 tariff-line rows returned)
- **Root cause:** Tariff codes are stored as 10-char dotted strings (e.g., `8708.30.00`), but SQL filtered for `LENGTH(code) = 8`
- **Fix:** Changed to `LENGTH(code) = 10` in both `getCodesUnderHeading()` and `searchWithinChapter()` call

### Bug 2: `iron_steel_articles` rule too broad
- **File:** `backend/src/rules/chapter-rules.ts:572-586`
- **Impact:** "stainless steel kitchen knife" routed to Ch.73 (should be Ch.82), "stainless steel thermos flask" routed to Ch.73 (should be Ch.96)
- **Root cause:** Rule matched any steel product without checking if the product has its own dedicated chapter
- **Fix:** Added `hasDedicatedChapter` exclusion list covering cutlery/tools (Ch.82) and thermos/vacuum vessels (Ch.96)

### Bug 3: `vehicle_parts_function` rule matches toy vehicles
- **File:** `backend/src/rules/chapter-rules.ts:76-92`
- **Impact:** "plastic toy car" routed to Ch.87 (should be Ch.95)
- **Root cause:** Rule matched "car" in "toy car" without checking if it's a toy
- **Fix:** Added `notToy` check using word-boundary regex (`\b(toy|toys|...)\b`), which correctly avoids false-positive on "Toyota"

### New Rules Added
- **`cutlery_tools`** (priority 66): Routes knives, cutlery, hand tools to Ch.82
- **`toys_games`** (priority 67): Routes toys, dolls, games to Ch.95
- **`thermos_vacuum_flasks`** (priority 66): Routes thermos/vacuum flasks to Ch.96

---

## B. Bugs Found but Deferred

1. **Corrupted chapter titles:** ~20 chapters have garbage in JSONB `chapterTitle` field. Requires SQL audit + cleanup.
2. **Metadata headers in notes:** "Sl.No. Notes Notification Date..." strings in `chapterNotes` arrays. Requires SQL cleanup.
3. **Missing chapter notes:** 10 chapters (50, 52, 53, 64, 75, 76, 78, 79, 80, 81) have no notes data.
4. **Substring matching in rules:** Several rules use `query.includes()` which is substring-based. Low priority.

---

## C. Before/After Results Table

### Blocker Test Cases (5/5 fixed)

| # | Query | Before | After | Status |
|---|-------|--------|-------|--------|
| 1 | stainless steel kitchen knife | Ch.73 / 7319.00.00 (fallback) | Ch.82 / 8211.91.00 | FIXED |
| 2 | plastic toy car | Ch.87 / 8715.00.00 (fallback) | Ch.95 / 9503.00.20 | FIXED |
| 3 | leather handbag with textile strap | Ch.42 / 4202.00.00 (fallback) | Ch.42 / 4202.21.10 | FIXED |
| 4 | stainless steel thermos flask | Ch.73 / 7309.00.00 (fallback) | Ch.96 / 9617.00.11 | FIXED |
| 5 | wooden picture frame | Ch.44 / 4414.00.00 (fallback) | Ch.44 / 4414.90.00 | FIXED |

### Full Integration Suite (28 cases)

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Chapter Accuracy | ~89% | 96.4% (27/28) | 95% |
| Heading Accuracy | ~70% | 96.4% (27/28) | 85% |

### Known Remaining Failure
- "air filter for automobile engine" → Ch.84 instead of Ch.87. This is by design: `filters_machinery` rule (priority 103) intentionally routes filters to Ch.84 per Heading 8421.

---

## D. Remaining Accuracy Gaps

1. **Air filter classification:** The `filters_machinery` rule routes all filters to Ch.84. Automobile air filters could arguably go to Ch.87, but HS rules give filters their own heading (8421). This is a legitimate classification debate, not a bug.

---

## E. Unexpected Discoveries

1. **LENGTH bug affected ALL classifications**, not just the 2 test cases listed. Every single tariff-line selection was hitting the `.00.00` fallback because zero rows matched `LENGTH(code) = 8`. This was the highest-impact single bug.
2. **New chapter rules dramatically improved routing.** Adding explicit rules for Ch.82, Ch.95, and Ch.96 means these product categories no longer depend on LLM semantic search for chapter determination.
3. **Heading accuracy jumped significantly** (from ~70% to 96.4%) — primarily because the LENGTH fix allowed the code-selector to actually find and choose among real tariff-line codes instead of always falling back.

---

## Files Changed (5 total)

| File | Change |
|------|--------|
| `backend/src/database/hs-codes.ts` | `LENGTH(code) = 8` → `10`, updated comments |
| `backend/src/classifier/code-selector.ts` | `searchWithinChapter(..., 8, 5)` → `10`, updated log |
| `backend/src/rules/chapter-rules.ts` | Added exclusions to 2 rules, added 3 new rules |
| `backend/src/tests/blocker-fix-test.ts` | New: 5-case blocker regression test |
| `backend/src/tests/results/blocker-fix-report.md` | New: this report |

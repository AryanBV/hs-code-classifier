# Session 1: Notes Structure Diagnosis Report

**Date:** 2026-01-21
**Status:** DIAGNOSIS COMPLETE
**No code changes made** - Read-only investigation

---

## Executive Summary

The **Part 4 audit showing 0% chapter coverage is correct** - but it's not a data quality issue. It's an **architectural design choice**: chapter notes are **denormalized** and stored redundantly at the 10-digit tariff line level, not at the 2-digit chapter level.

---

## Q1: What is the exact structure of the `notes` field?

### Finding: JSONB with 6 standardized keys

```
Notes field type: jsonb
JSON structure: {
  "keys_found": [
    "chapterNotes",      // Array of strings - legal classification rules
    "chapterNumber",     // String - e.g., "49", "29"
    "chapterTitle",      // String - e.g., "Organic Chemicals"
    "exportLicensingNotes", // String - export policy info
    "policyConditions",  // Array of objects - regulatory conditions
    "sectionNotes"       // Array of strings - HS Section-level notes
  ]
}
```

### Sample Structure (from code 4910.00.10):
```json
{
  "chapterNotes": [
    "Sl.No. Notes Notification Date Notification No",
    "This Chapter does not cover: (a) photographic negatives...",
    "For the purposes of Chapter 49, the term \"printed\" also means...",
    "Newspapers, journals and periodicals which are bound..."
  ],
  "chapterTitle": "Printed Books, Newspapers, Pictures...",
  "sectionNotes": [
    "Main Notes Sl.No. Notes Notification Date Notification No",
    "This Chapter does not cover: (a) photographic negatives..."
  ],
  "chapterNumber": "49",
  "policyConditions": [],
  "exportLicensingNotes": ""
}
```

---

## Q2: At which code levels do notes exist?

### Distribution by Code Level

| Code Length | Level | Total Codes | With Notes | Percentage |
|-------------|-------|-------------|------------|------------|
| 2 | Chapter | 97 | **0** | **0.00%** |
| 4 | Heading | 1,238 | 1,125 | 90.87% |
| 7 | Subheading | 5,631 | 2,218 | 39.39% |
| 10 | Tariff Line | 12,475 | **12,475** | **100.00%** |

### Key Insight:
- **2-digit chapter codes have NO notes** - the `notes` field is NULL for all 97 chapters
- **10-digit tariff lines have 100% notes coverage** - every tariff line has the full notes object
- Notes are **denormalized**: chapter notes are copied to every tariff line within that chapter

---

## Q3: What do notes actually contain?

### Content Analysis

**chapterNotes** (Array of strings):
- Legal classification rules from the Harmonized System
- "This Chapter does not cover..." exclusion rules
- "For the purposes of heading XXXX..." clarifications
- Definitions and scope limitations

**sectionNotes** (Array of strings):
- Higher-level HS Section rules
- Cross-chapter classification guidance
- Often truncated/partial in the data

**policyConditions** (Array of objects):
- Indian export/import policy conditions
- Example from Chapter 29:
  ```json
  {
    "number": 1,
    "description": "Export of Hydrofluorocarbons (HFCs) is permitted with an Export Authorization subject to NOC of Ozone Cell, MoEF&CC"
  }
  ```

**exportLicensingNotes** (String):
- Usually empty string
- Contains specific licensing requirements when applicable

### Sample Notes from Different Chapters:

**Chapter 49 (Printed Books):**
> "This Chapter does not cover: (a) photographic negatives or positives on transparent bases (Chapter 37); (b) maps, plans or globes, in relief..."

**Chapter 29 (Organic Chemicals):**
> "Except where the context otherwise requires, the headings of this Chapter apply only to: (a) separate chemically defined organic compounds..."

**Chapter 85 (Electrical Equipment):**
> "This Chapter does not cover: (a) electrically warmed blankets, bed pads, foot-muffs or the like; electrically warmed clothing..."

---

## Q4: Why did Part 4 audit show 0%?

### Root Cause Analysis

**The Part 4 audit was technically correct.**

The audit queried for `chapterNotes` and `sectionNotes` keys at 2-digit chapter codes:

```sql
SELECT code, notes ? 'chapterNotes' as has_chapter_notes
FROM hs_codes
WHERE LENGTH(code) = 2
```

**Result:** ALL 97 chapters returned `NULL` for both checks because:

1. **2-digit codes exist** (97 rows) with valid descriptions like "Coffee, Tea, Maté and Spices"
2. **BUT the `notes` field is NULL** for all 2-digit codes
3. The notes data is stored **only at the 10-digit tariff line level**

### Evidence:

```sql
-- All 2-digit codes have NULL notes
SELECT code, description, notes
FROM hs_codes WHERE LENGTH(code) = 2;

-- Results:
-- code | description                        | notes
-- 09   | Coffee, Tea, Maté and Spices       | NULL
-- 10   | Cereals                            | NULL
-- ...all 97 chapters have NULL notes
```

### Why This Architecture?

The data was likely imported from a tariff schedule where:
1. Each 10-digit tariff line is a complete record
2. Chapter notes were included in each tariff line for self-contained lookup
3. No separate "chapter" records with notes were created

---

## Implications for Rules Engine

### Current State:
- Chapter notes **ARE available** - but only by querying any 10-digit code within that chapter
- To get Chapter 09 notes, query any code starting with `09` at 10-digit level

### Recommended Approach for Rules Engine:

**Option A: Query-Time Lookup (No Schema Change)**
```sql
-- Get chapter notes for any chapter by sampling one tariff line
SELECT notes->'chapterNotes' as chapter_notes,
       notes->'sectionNotes' as section_notes
FROM hs_codes
WHERE code LIKE '09%'
  AND LENGTH(code) = 10
  AND notes IS NOT NULL
LIMIT 1;
```

**Option B: Populate 2-Digit Notes (One-Time Migration)**
```sql
-- Copy notes from a representative 10-digit code to its 2-digit parent
UPDATE hs_codes c2
SET notes = (
  SELECT notes
  FROM hs_codes c10
  WHERE c10.code LIKE c2.code || '%'
    AND LENGTH(c10.code) = 10
    AND c10.notes IS NOT NULL
  LIMIT 1
)
WHERE LENGTH(c2.code) = 2;
```

### Access Pattern for Classification:

```typescript
// To get chapter notes for classification logic:
async function getChapterNotes(chapterCode: string): Promise<ChapterNotes> {
  const result = await prisma.hsCode.findFirst({
    where: {
      code: { startsWith: chapterCode },
      notes: { not: null }
    },
    select: { notes: true }
  });
  return result?.notes as ChapterNotes;
}
```

---

## Summary Table

| Question | Answer |
|----------|--------|
| Q1: Notes field type | JSONB with 6 keys |
| Q2: Where do notes exist? | 100% at 10-digit, 0% at 2-digit |
| Q3: What's in notes? | Chapter notes, section notes, policy conditions |
| Q4: Why 0% in Part 4? | Notes are denormalized to tariff lines, not stored at chapter level |

---

## Success Criteria Checklist

- [x] All 4 questions answered with evidence
- [x] Root cause of 0% chapter coverage identified
- [x] Clear documentation in session1-notes-diagnosis.md
- [x] No code changes made
- [x] No new services created

---

## Next Steps (For Future Sessions)

1. **Decision needed:** Populate 2-digit notes OR use query-time lookup?
2. **Rules engine design:** Can access notes via any tariff line in the target chapter
3. **Consider:** Adding a materialized view or caching layer for chapter notes lookup
